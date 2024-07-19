import React from 'react';

const Home = async () => {
  let data = '';
  try {
    const response = await fetch('http://express:8080');
    if (!response.ok) {
      data = 'Network response was not ok.';
    }
    const textData = await response.text();
    data = textData;
  } catch (error) {
    console.log('-------------------------------------');
    console.log(error);
    console.log('-------------------------------------');
    data = 'Network response was not ok. in the Catch Block';
  }

  return (
    <>
      <div className="p-6">ok</div>
      <div>
        {data ? (
          <h1 style={{ fontSize: '50px' }}>{data}</h1>
        ) : (
          <h1>We did Not Got The Data </h1>
        )}
      </div>
      <div>
        {process.env.NODE_ENV ? (
          <h1 style={{ fontSize: '50px' }}>{process.env.NODE_ENV}</h1>
        ) : (
          <h1>We did Not Got The NODE_ENV </h1>
        )}
      </div>
    </>
  );
};

export default Home;
